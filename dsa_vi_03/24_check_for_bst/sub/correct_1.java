

// User function Template for Java

class Solution {
    // Function to check whether a Binary Tree is BST or not.
    boolean isBST(Node root) {
        // code here.
          return BST(root,null,null);
    }
     boolean BST(Node root,Node min,Node max){
        if(root==null){
            return true;
        }
        if(min!=null && root.data<=min.data){
            return false;
        }
        if(max!=null && root.data>=max.data){
            return false;
        }
        return BST(root.left,min,root) && BST(root.right,root,max);
    }
    
}