

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
    int findDist(Node root, int a, int b) {
        Node lca=lca(root,a,b);
        int l=distanceBetweenTwoNodes(lca,a,0);
        int r=distanceBetweenTwoNodes(lca,b,0);
        
        return l+r;
    }
    
    Node lca(Node root,int r1,int r2){
        if(root==null || root.data==r1 || root.data==r2)
            return root;
        
        Node left=lca(root.left,r1,r2);
        
            
        Node right=lca(root.right,r1,r2);
        if(left!=null && right!=null)
            return root;
        return left==null?right:left;
        
    }
    
    int distanceBetweenTwoNodes(Node root,int a,int distance){
        if(root==null)
            return 0;
        if(root.data==a)
            return distance;
        
        int left=distanceBetweenTwoNodes(root.left,a,distance+1);
        if(left!=0)
            return left;
        int right=distanceBetweenTwoNodes(root.right,a,distance+1);
        
        return right;
        
    }
}