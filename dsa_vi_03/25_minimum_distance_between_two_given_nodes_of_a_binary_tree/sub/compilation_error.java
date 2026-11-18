

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
    
    public int Distance(Node root, int a){
        if(root==null){
            return -1;
        }
        
        if(root.data==a){
            return 0;
        }
        
        int left=Distance(root.left,a);
        if(left!=-1){
            return left+1;
        }
        
        int right=Distance(root.right,b);
        if(right!=-1){
            return right+1;
        }
        
        return -1;
        
        
    }
    
    
    int findDist(Node root, int a, int b) {
        Node lca=Ancestor(root,a,b);
        int d1=Distance(lca,a);
        int d2=Distance(lca,b);
        return d1+d2;
    }
    public Node Ancestor(Node root, int a, int b){
        if(root==null){
            return root;
        }
        
        if(root.data==a||root.data==b){
            return root;
        }
        
        Node left=Ancestor(root.left,a,b);
        Node right=Ancestor(root.right,a,b);
        
        if(left!=null&&right!=null){
            return root;
        }
        
        return left==null?right:left;
        
        
    }
    
}