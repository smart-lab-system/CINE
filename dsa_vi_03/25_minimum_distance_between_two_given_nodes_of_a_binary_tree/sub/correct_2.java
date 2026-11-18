

// FUNCTION CODE
/* A Binary Tree node
class Node
{
    int data;
    Node left, right;
   Node(int item)    {
        data = item;
        left = right = null;
    }
} */

/* Should return minimum distance between a and b
   in a tree with given root*/
class GfG {
    Node lca(Node root, int a, int b){
        if(root == null || root.data == a || root.data == b){
            return root;
        }
        
        Node leftLca = lca(root.left, a, b);
        Node rightLca = lca(root.right, a, b);
        
        if(leftLca != null && rightLca != null){
            return root;
        }
        else if(leftLca == null){
            return rightLca;
        }else{
            return leftLca;
        }
    }
    
    int minDist(Node root, int a){
        if(root == null){
            return -1;
        }
        
        if(root.data == a){
            return 0;
        }
        int lDist = minDist(root.left, a);
        int rDist = minDist(root.right, a);
        
        if (lDist == -1 && rDist == -1) {
            return -1;
        }else if(lDist != -1){
            return lDist+1;
        }else{
            return rDist+1;
        }
        
        
        
    }
    
    int findDist(Node root, int a, int b) {
        // Your code here
        
        Node lowestCommonAncestor = lca(root,a,b);
        int dist1 = minDist(lowestCommonAncestor, a);
        int dist2 = minDist(lowestCommonAncestor, b);
        return dist1+dist2;
        
        
        
        
    }
}